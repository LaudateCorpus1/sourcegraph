package symbols

import (
	"archive/tar"
	"bytes"
	"context"
	"io"
	"net/http/httptest"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/sourcegraph/go-ctags"

	"github.com/sourcegraph/sourcegraph/cmd/symbols/internal/parser"
	symbolsSearch "github.com/sourcegraph/sourcegraph/cmd/symbols/internal/search"
	"github.com/sourcegraph/sourcegraph/cmd/symbols/internal/sqlite"
	"github.com/sourcegraph/sourcegraph/internal/api"
	"github.com/sourcegraph/sourcegraph/internal/diskcache"
	"github.com/sourcegraph/sourcegraph/internal/httpcli"
	"github.com/sourcegraph/sourcegraph/internal/search"
	"github.com/sourcegraph/sourcegraph/internal/search/result"
	symbolsclient "github.com/sourcegraph/sourcegraph/internal/symbols"
)

func TestHandler(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { os.RemoveAll(tmpDir) }()

	files := map[string]string{"a.js": "var x = 1"}
	gitserverClient := NewMockGitserverClient()
	gitserverClient.FetchTarFunc.SetDefaultHook(func(ctx context.Context, repo api.RepoName, commit api.CommitID, paths []string) (io.ReadCloser, error) {
		return createTar(files)
	})

	cache := &diskcache.Store{
		Dir:               tmpDir,
		Component:         "symbols",
		BackgroundTimeout: 20 * time.Minute,
	}

	parserPool, err := parser.NewParserPool(func() (ctags.Parser, error) { return mockParser{"x", "y"}, nil }, 15)
	if err != nil {
		t.Fatal(err)
	}

	parser := parser.NewParser(gitserverClient, parserPool, make(chan int, 15))
	databaseWriter := sqlite.NewDatabaseWriter(gitserverClient, parser, cache)
	searcher := symbolsSearch.NewSearcher(gitserverClient, parser, cache, databaseWriter)
	server := httptest.NewServer(NewHandler(searcher))
	defer server.Close()
	client := symbolsclient.Client{
		URL:        server.URL,
		HTTPClient: httpcli.InternalDoer,
	}
	x := result.Symbol{Name: "x", Path: "a.js"}
	y := result.Symbol{Name: "y", Path: "a.js"}

	tests := map[string]struct {
		args search.SymbolsParameters
		want result.Symbols
	}{
		"simple": {
			args: search.SymbolsParameters{First: 10},
			want: []result.Symbol{x, y},
		},
		"onematch": {
			args: search.SymbolsParameters{Query: "x", First: 10},
			want: []result.Symbol{x},
		},
		"nomatches": {
			args: search.SymbolsParameters{Query: "foo", First: 10},
			want: nil,
		},
		"caseinsensitiveexactmatch": {
			args: search.SymbolsParameters{Query: "^X$", First: 10},
			want: []result.Symbol{x},
		},
		"casesensitiveexactmatch": {
			args: search.SymbolsParameters{Query: "^x$", IsCaseSensitive: true, First: 10},
			want: []result.Symbol{x},
		},
		"casesensitivenoexactmatch": {
			args: search.SymbolsParameters{Query: "^X$", IsCaseSensitive: true, First: 10},
			want: nil,
		},
		"caseinsensitiveexactpathmatch": {
			args: search.SymbolsParameters{IncludePatterns: []string{"^A.js$"}, First: 10},
			want: []result.Symbol{x, y},
		},
		"casesensitiveexactpathmatch": {
			args: search.SymbolsParameters{IncludePatterns: []string{"^a.js$"}, IsCaseSensitive: true, First: 10},
			want: []result.Symbol{x, y},
		},
		"casesensitivenoexactpathmatch": {
			args: search.SymbolsParameters{IncludePatterns: []string{"^A.js$"}, IsCaseSensitive: true, First: 10},
			want: nil,
		},
		"exclude": {
			args: search.SymbolsParameters{ExcludePattern: "a.js", IsCaseSensitive: true, First: 10},
			want: nil,
		},
	}
	for label, test := range tests {
		t.Run(label, func(t *testing.T) {
			result, err := client.Search(context.Background(), test.args)
			if err != nil {
				t.Fatal(err)
			}
			if result != nil && !reflect.DeepEqual(*result, test.want) {
				t.Errorf("got %+v, want %+v", *result, test.want)
			}
			if result == nil && test.want != nil {
				t.Errorf("got nil, want %+v", test.want)
			}
		})
	}
}

func createTar(files map[string]string) (io.ReadCloser, error) {
	buf := new(bytes.Buffer)
	w := tar.NewWriter(buf)
	for name, body := range files {
		hdr := &tar.Header{
			Name: name,
			Mode: 0o600,
			Size: int64(len(body)),
		}
		if err := w.WriteHeader(hdr); err != nil {
			return nil, err
		}
		if _, err := w.Write([]byte(body)); err != nil {
			return nil, err
		}
	}

	err := w.Close()
	if err != nil {
		return nil, err
	}
	return io.NopCloser(bytes.NewReader(buf.Bytes())), nil
}

type mockParser []string

func (m mockParser) Parse(name string, content []byte) ([]*ctags.Entry, error) {
	entries := make([]*ctags.Entry, len(m))
	for i, name := range m {
		entries[i] = &ctags.Entry{Name: name, Path: "a.js"}
	}
	return entries, nil
}

func (mockParser) Close() {}
