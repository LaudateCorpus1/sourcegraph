package symbols

import (
	"context"
	"fmt"
	"os"
	"path"
	"testing"
	"time"

	"github.com/inconshreveable/log15"

	"github.com/sourcegraph/sourcegraph/cmd/symbols/internal/parser"
	"github.com/sourcegraph/sourcegraph/internal/diskcache"
	"github.com/sourcegraph/sourcegraph/internal/testutil"
)

func BenchmarkSearch(b *testing.B) {
	log15.Root().SetHandler(log15.LvlFilterHandler(log15.LvlError, log15.Root().GetHandler()))

	gitserverClient := NewMockGitserverClient()
	gitserverClient.FetchTarFunc.SetDefaultHook(testutil.FetchTarFromGithubWithPaths)

	cache := &diskcache.Store{
		Dir:               "/tmp/symbols-cache",
		Component:         "symbols",
		BackgroundTimeout: 20 * time.Minute,
	}

	parserPool, err := parser.NewParserPool(parser.NewParser, 15)
	if err != nil {
		b.Fatal(err)
	}

	ctx := context.Background()
	b.ResetTimer()

	indexTests := []SearchArgs{
		{Repo: "github.com/sourcegraph/go-langserver", CommitID: "391a062a7d9977510e7e883e412769b07fed8b5e"},
		{Repo: "github.com/moby/moby", CommitID: "6e5c2d639f67ae70f54d9f2285f3261440b074aa"},
	}

	queryTests := []SearchArgs{
		{Repo: "github.com/sourcegraph/go-langserver", CommitID: "391a062a7d9977510e7e883e412769b07fed8b5e", Query: "^sortedImportRecord$", First: 10},
		{Repo: "github.com/sourcegraph/go-langserver", CommitID: "391a062a7d9977510e7e883e412769b07fed8b5e", Query: "1234doesnotexist1234", First: 1},
		{Repo: "github.com/moby/moby", CommitID: "6e5c2d639f67ae70f54d9f2285f3261440b074aa", Query: "^fsCache$", First: 10},
		{Repo: "github.com/moby/moby", CommitID: "6e5c2d639f67ae70f54d9f2285f3261440b074aa", Query: "1234doesnotexist1234", First: 1},
	}

	runIndexTest := func(test SearchArgs) {
		b.Run(fmt.Sprintf("indexing %s@%s", path.Base(string(test.Repo)), test.CommitID[:3]), func(b *testing.B) {
			for n := 0; n < b.N; n++ {
				tempFile, err := os.CreateTemp("", "")
				if err != nil {
					b.Fatal(err)
				}
				defer os.Remove(tempFile.Name())
				err = writeAllSymbolsToNewDB(ctx, gitserverClient, parserPool, make(chan int, 15), tempFile.Name(), test.Repo, test.CommitID)
				if err != nil {
					b.Fatal(err)
				}
			}
		})
	}

	runQueryTest := func(test SearchArgs) {
		b.Run(fmt.Sprintf("searching %s@%s %s", path.Base(string(test.Repo)), test.CommitID[:3], test.Query), func(b *testing.B) {
			_, err := doSearch(ctx, gitserverClient, cache, parserPool, make(chan int, 15), test)
			if err != nil {
				b.Fatal(err)
			}
			b.ResetTimer()
			for n := 0; n < b.N; n++ {
				_, err := doSearch(ctx, gitserverClient, cache, parserPool, make(chan int, 15), test)
				if err != nil {
					b.Fatal(err)
				}
			}
		})
	}

	for _, test := range indexTests {
		runIndexTest(test)
	}

	for _, test := range queryTests {
		runQueryTest(test)
	}
}
