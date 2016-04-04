// GENERATED CODE - DO NOT EDIT!
// @generated
//
// Generated by:
//
//   go run gen_list.go -o list.go
//
// Called via:
//
//   go generate
//

package local

import (
	"sourcegraph.com/sourcegraph/sourcegraph/services/svc"
)

// Services contains all services implemented in this package.
var Services = svc.Services{
	Accounts:          Accounts,
	Annotations:       Annotations,
	Auth:              Auth,
	Builds:            Builds,
	Defs:              Defs,
	Deltas:            Deltas,
	GraphUplink:       GraphUplink,
	Meta:              Meta,
	MirrorRepos:       MirrorRepos,
	MultiRepoImporter: Graph,
	Notify:            Notify,
	Orgs:              Orgs,
	People:            People,
	RegisteredClients: RegisteredClients,
	RepoStatuses:      RepoStatuses,
	RepoTree:          RepoTree,
	Repos:             Repos,
	Users:             Users,
}
