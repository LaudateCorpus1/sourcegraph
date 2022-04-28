# Continuous integration development

This document covers information about contributing to [Sourcegraph's continuous integration tools](./index.md).

## Pipeline generator

The source code of [Sourcegraph's Buildkite pipelines](./index.md#buildkite-pipelines) generator is in [`/enterprise/dev/ci`](https://sourcegraph.com/github.com/sourcegraph/sourcegraph@main/-/tree/enterprise/dev/ci).
Internally, the pipeline generator determines what gets run over contributions based on:

1. [Run types](#run-types), determined by branch naming conventions, tags, and environment variables
2. [Diff types](#diff-types), determined by what files have been changed in a given branch

The above factors are then used to determine the appropriate [operations](#operations), composed of [step options](#step-options), that translate into steps in the resulting pipeline.

> WARNING: Sourcegraph's pipeline generator and its generated output are under the [Sourcegraph Enterprise license](https://github.com/sourcegraph/sourcegraph/blob/main/LICENSE.enterprise).

### Run types

<div class="embed">
  <iframe src="https://sourcegraph.com/embed/notebooks/Tm90ZWJvb2s6MTU5"
    style="width:100%;height:720px" frameborder="0" sandbox="allow-scripts allow-same-origin allow-popups">
  </iframe>
</div>

### Diff types

<div class="embed">
  <iframe src="https://sourcegraph.com/embed/notebooks/Tm90ZWJvb2s6MTYw"
    style="width:100%;height:720px" frameborder="0" sandbox="allow-scripts allow-same-origin allow-popups">
  </iframe>
</div>

### Operations

<div class="embed">
  <iframe src="https://sourcegraph.com/embed/notebooks/Tm90ZWJvb2s6MTYx"
    style="width:100%;height:720px" frameborder="0" sandbox="allow-scripts allow-same-origin allow-popups">
  </iframe>
</div>

#### Developing PR checks

To create a new check that can run on pull requests on relevant files, refer to how [diff types](#diff-types) work to get started.

Then, you can add a new check to [`CoreTestOperations`](https://sourcegraph.com/search?q=context:global+repo:%5Egithub%5C.com/sourcegraph/sourcegraph%24+file:%5Eenterprise/dev/ci/internal/ci+CoreTestOperations+type:symbol+&patternType=literal).
Make sure to follow the best practices outlined in docstring.

For more advanced pipelines, see [Run types](#run-types).

### Step options

> NOTE: Coming soon!

#### Creating annotations

Annotations get rendered in the Buildkite UI to present the viewer notices about the build.
The pipeline generator provides an API for this that, at a high level, works like this:

1. In your script, leave a file in `./annotations`:

  ```sh
  if [ $EXIT_CODE -ne 0 ]; then
    echo -e "$OUT" >./annotations/docsite
  fi
  ```

2. In your pipeline operation, replace the usual `bk.Cmd` with `bk.AnnotatedCmd`:

  ```go
    pipeline.AddStep(":memo: Check and build docsite",
      bk.AnnotatedCmd("./dev/check/docsite.sh", bk.AnnotatedCmdOpts{
        Annotations: &bk.AnnotationOpts{},
      }))
  ```

3. That's it!

For more details about best practices and additional features and capabilities, please refer to [the `bk.AnnotatedCmd` docstring](https://sourcegraph.com/search?q=context:global+repo:%5Egithub%5C.com/sourcegraph/sourcegraph%24+file:%5Eenterprise/dev/ci/internal/buildkite+AnnotatedCmd+type:symbol&patternType=literal).

#### Caching build artefacts

For caching artefacts in steps to speed up steps, see [How to cache CI artefacts](../../how-to/cache_ci_artefacts.md).

### Observability

> NOTE: Sourcegraph teammates should refer to the [CI incidents playbook](https://handbook.sourcegraph.com/departments/product-engineering/engineering/process/incidents/playbooks/ci#scenarios) for help managing issues with [pipeline health](./index.md#pipeline-health).

#### Pipeline command tracing

Every successful build of the `sourcegraph/sourcegraph` repository comes with an annotation pointing at the full trace of the build on [Honeycomb.io](https://honeycomb.io).
See the [Buildkite board on Honeycomb](https://ui.honeycomb.io/sourcegraph/board/sqPvYj5BXNy/Buildkite) for an overview.

Individual commands are tracked from the perspective of a given [step](#step-options):

```go
  pipeline.AddStep(":memo: Check and build docsite", /* ... */)
```

Will result in a single trace span for the `./dev/check/docsite.sh` script. But the following will have individual trace spans for each `yarn` commands:

```go
  pipeline.AddStep(fmt.Sprintf(":%s: Puppeteer tests for %s extension", browser, browser),
    // ...
    bk.Cmd("yarn --frozen-lockfile --network-timeout 60000"),
    bk.Cmd("yarn workspace @sourcegraph/browser -s run build"),
    bk.Cmd("yarn run cover-browser-integration"),
    bk.Cmd("yarn nyc report -r json"),
    bk.Cmd("dev/ci/codecov.sh -c -F typescript -F integration"),
```

Therefore, it's beneficial for tracing purposes to split the step in multiple commands, if possible.

#### Test analytics

Our test analytics is currently powered by a Buildkite beta feature for analysing individual tests across builds called [Buildkite Analytics](https://buildkite.com/test-analytics).
This tool enables us to observe the evolution of each individual test on the following metrics: duration and flakiness.

Browse the [dashboard](https://buildkite.com/organizations/sourcegraph/analytics) to explore the metrics and optionally set monitors that will alert if a given test or a test suite is deviating from its historical duration or flakiness.

In order to track a new test suite, test results must be converted to JUnit XML reports and uploaded to Buildkite.
The pipeline generator provides an API for this that, at a high level, works like this:

1. In your script, leave your JUnit XML test report in `./test-reports`
2. [Create a new Test Suite](https://buildkite.com/organizations/sourcegraph/analytics/suites/new) in the Buildkite Analytics UI.
3. In your pipeline operation, replace the usual `bk.Cmd` with `bk.AnnotatedCmd`:

  ```go
  pipeline.AddStep(":jest::globe_with_meridians: Test",
    withYarnCache(),
    bk.AnnotatedCmd("dev/ci/yarn-test.sh client/web", bk.AnnotatedCmdOpts{
      TestReports: &bk.TestReportOpts{/* ... */},
    }),
  ```

4. That's it!

For more details about best practices and additional features and capabilities, please refer to [the `bk.AnnotatedCmd` docstring](https://sourcegraph.com/search?q=context:global+repo:%5Egithub%5C.com/sourcegraph/sourcegraph%24+file:%5Eenterprise/dev/ci/internal/buildkite+AnnotatedCmd+type:symbol&patternType=literal).

> WARNING: The Buildkite API is not finalized and neither are the configuration options for `TestReportOpts`.
> To get started with Buildkite Analytics please reach out to the `#dev-experience` channel for assistance.

### Buildkite infrastructure

Our continuous integration system is composed of two parts, a central server controled by Buildkite and agents that are operated by Sourcegraph within our own infrastructure.
In order to provide strong isolation across builds, to prevent a previous build to create any effect on the next one, our agents are stateless jobs.

When a build is dispatched by Buildkite, each individual job will be assigned to an agent in a pristine state. Each agent will execute its assigned job, automatically report back to Buildkite and finally shuts itself down. A fresh agent will then be created and will stand in line for the next job.  

This means that our agents are totally **stateless**, exactly like the runners used in GitHub actions.

Also see [Flaky infrastructure](#flaky-infrastructure), [Continous integration infrastructure](https://handbook.sourcegraph.com/departments/product-engineering/engineering/tools/infrastructure/ci), and the [Continuous integration changelog](https://handbook.sourcegraph.com/departments/product-engineering/engineering/tools/infrastructure/ci/changelog).

#### Pipeline setup

To set up Buildkite to use the rendered pipeline, add the following step in the [pipeline settings](https://buildkite.com/sourcegraph/sourcegraph/settings):

```shell
go run ./enterprise/dev/ci/gen-pipeline.go | buildkite-agent pipeline upload
```

#### Managing secrets

The term _secret_ refers to authentication credentials like passwords, API keys, tokens, etc. which are used to access a particular service. Our CI pipeline must never leak secrets:

- to add a secret, use the Secret Manager on Google Cloud and then inject it at deployment time as an environment variable in the CI agents, which will make it available to every step.
- use an environment variable name with one of the following suffixes to ensure it gets redacted in the logs: `*_PASSWORD, *_SECRET, *_TOKEN, *_ACCESS_KEY, *_SECRET_KEY, *_CREDENTIALS`
- while environment variables can be assigned when declaring steps, they should never be used for secrets, because they won't get redacted, even if they match one of the above patterns.