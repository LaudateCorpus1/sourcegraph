import ErrorIcon from '@sourcegraph/icons/lib/Error'
import { upperFirst } from 'lodash'
import * as React from 'react'
import { RouteComponentProps } from 'react-router'
import { Subject, Subscription } from 'rxjs'
import { catchError, concat, distinctUntilChanged, map, mergeMap, switchMap, tap } from 'rxjs/operators'
import * as GQL from '../../backend/graphqlschema'
import { HeroPage } from '../../components/HeroPage'
import { PageTitle } from '../../components/PageTitle'
import { updateSettings } from '../../configuration/backend'
import { fetchSettings } from '../../configuration/backend'
import { SettingsFile } from '../../settings/SettingsFile'
import { eventLogger } from '../../tracking/eventLogger'
import { refreshConfiguration } from '../../user/settings/backend'
import { ErrorLike, isErrorLike } from '../../util/errors'
import { OrgAreaPageProps } from '../area/OrgArea'

interface Props extends OrgAreaPageProps, RouteComponentProps<{}> {
    isLightTheme: boolean
}

interface State {
    settingsOrError?: GQL.ISettings | null | ErrorLike
    commitError?: Error
}

export class OrgSettingsConfigurationPage extends React.PureComponent<Props, State> {
    public state: State = {}

    private orgChanges = new Subject<{ id: GQL.ID /* org ID */ }>()
    private subscriptions = new Subscription()

    public componentDidMount(): void {
        // Load settings.
        this.subscriptions.add(
            this.orgChanges
                .pipe(
                    distinctUntilChanged(),
                    switchMap(({ id }) =>
                        fetchSettings(id).pipe(catchError(error => [error]), map(c => ({ settingsOrError: c })))
                    )
                )
                .subscribe(stateUpdate => this.setState(stateUpdate), err => console.error(err))
        )

        // Log view event.
        this.subscriptions.add(
            this.orgChanges
                .pipe(
                    distinctUntilChanged((a, b) => a.id === b.id),
                    tap(() => eventLogger.logViewEvent('OrgSettingsConfiguration'))
                )
                .subscribe()
        )

        this.orgChanges.next(this.props.org)
    }

    public componentWillReceiveProps(props: Props): void {
        if (props.org !== this.props.org) {
            this.orgChanges.next(props.org)
        }
    }

    public componentWillUnmount(): void {
        this.subscriptions.unsubscribe()
    }

    public render(): JSX.Element | null {
        if (this.state.settingsOrError === undefined) {
            return null // loading
        }
        if (isErrorLike(this.state.settingsOrError)) {
            // TODO!(sqs): show a 404 if org not found, instead of a generic error
            return <HeroPage icon={ErrorIcon} title="Error" subtitle={upperFirst(this.state.settingsOrError.message)} />
        }

        return (
            <div className="settings-file-container">
                <PageTitle title="Organization configuration" />
                <h2>Configuration</h2>
                <p>Organization settings apply to all members. User settings override organization settings.</p>
                <SettingsFile
                    settings={this.state.settingsOrError}
                    commitError={this.state.commitError}
                    onDidCommit={this.onDidCommit}
                    onDidDiscard={this.onDidDiscard}
                    history={this.props.history}
                    isLightTheme={this.props.isLightTheme}
                />
            </div>
        )
    }

    private onDidCommit = (lastID: number | null, contents: string) => {
        this.setState({ commitError: undefined })
        updateSettings(this.props.org.id, lastID, contents)
            .pipe(mergeMap(() => refreshConfiguration().pipe(concat([null]))))
            .subscribe(
                () => {
                    this.setState({ commitError: undefined })
                    this.orgChanges.next({ id: this.props.org.id })
                },
                err => {
                    this.setState({ commitError: err })
                    console.error(err)
                }
            )
    }

    private onDidDiscard = (): void => {
        this.setState({ commitError: undefined })
    }
}
