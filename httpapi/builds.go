package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/mux"
	"sourcegraph.com/sourcegraph/sourcegraph/go-sourcegraph/sourcegraph"
	"sourcegraph.com/sourcegraph/sourcegraph/util/errcode"
	"sourcegraph.com/sourcegraph/sourcegraph/util/handlerutil"
)

func serveBuild(w http.ResponseWriter, r *http.Request) error {
	ctx, cl := handlerutil.Client(r)

	buildSpec, err := getBuildSpec(r)
	if err != nil {
		return err
	}

	build, err := cl.Builds.Get(ctx, buildSpec)
	if err != nil {
		return err
	}

	return writeJSON(w, build)
}

func serveBuildTasks(w http.ResponseWriter, r *http.Request) error {
	ctx, cl := handlerutil.Client(r)

	buildSpec, err := getBuildSpec(r)
	if err != nil {
		return err
	}

	var opt sourcegraph.BuildTaskListOptions
	if err := schemaDecoder.Decode(&opt, r.URL.Query()); err != nil {
		return err
	}

	tasks, err := cl.Builds.ListBuildTasks(ctx, &sourcegraph.BuildsListBuildTasksOp{
		Build: *buildSpec,
		Opt:   &opt,
	})
	if err != nil {
		return err
	}

	return writeJSON(w, tasks)
}

func serveBuilds(w http.ResponseWriter, r *http.Request) error {
	ctx, cl := handlerutil.Client(r)

	var opt sourcegraph.BuildListOptions
	err := schemaDecoder.Decode(&opt, r.URL.Query())
	if err != nil {
		return err
	}

	builds, err := cl.Builds.List(ctx, &opt)
	if err != nil {
		return err
	}

	if clientCached, err := writeCacheHeaders(w, r, time.Time{}, defaultCacheMaxAge); clientCached || err != nil {
		return err
	}

	return writeJSON(w, builds)
}

func getBuildSpec(r *http.Request) (*sourcegraph.BuildSpec, error) {
	v := mux.Vars(r)
	repo := v["Repo"]
	build, err := strconv.ParseUint(v["Build"], 10, 64)
	if repo == "" || err != nil {
		return nil, &errcode.HTTPErr{Status: http.StatusBadRequest, Err: err}
	}
	return &sourcegraph.BuildSpec{
		Repo: sourcegraph.RepoSpec{URI: repo},
		ID:   build,
	}, nil
}
