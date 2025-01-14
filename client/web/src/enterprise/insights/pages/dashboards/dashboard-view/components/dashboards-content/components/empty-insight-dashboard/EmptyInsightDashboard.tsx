import { FC } from 'react'

import { mdiPlus } from '@mdi/js'

import { Button, Link, Card, Tooltip, Icon } from '@sourcegraph/wildcard'

import { InsightDashboard, CustomInsightDashboard } from '../../../../../../../core'
import { useUiFeatures } from '../../../../../../../hooks'
import { encodeDashboardIdQueryParam } from '../../../../../../../routers.constant'
import { isDashboardConfigurable } from '../../utils/is-dashboard-configurable'

import styles from './EmptyInsightDashboard.module.scss'

interface EmptyInsightDashboardProps {
    dashboard: InsightDashboard
    onAddInsightRequest?: () => void
}

export const EmptyInsightDashboard: FC<EmptyInsightDashboardProps> = props => {
    const { dashboard, onAddInsightRequest } = props

    return isDashboardConfigurable(dashboard) ? (
        <EmptyCustomDashboard dashboard={dashboard} onAddInsightRequest={onAddInsightRequest} />
    ) : (
        <EmptyVirtualDashboard dashboardId={dashboard.id} />
    )
}

/**
 * Virtual empty dashboard state provides link to create a new code insight via creation UI.
 * Since all insights within virtual dashboards are calculated there's no ability to add insight to
 * this type of dashboard manually.
 */
export const EmptyVirtualDashboard: FC<{ dashboardId: string }> = props => (
    <section className={styles.emptySection}>
        <Card
            as={Link}
            to={encodeDashboardIdQueryParam('/insights/create', props.dashboardId)}
            className={styles.itemCard}
        >
            <Icon svgPath={mdiPlus} inline={false} aria-hidden={true} height="2rem" width="2rem" />
            <span>Create an insight</span>
        </Card>
    </section>
)

interface EmptyCustomDashboardProps {
    dashboard: CustomInsightDashboard
    onAddInsightRequest?: () => void
}

/**
 * Custom empty dashboard state provides ability to add existing insights to the dashboard.
 */
export const EmptyCustomDashboard: FC<EmptyCustomDashboardProps> = props => {
    const { dashboard, onAddInsightRequest } = props

    const {
        dashboard: { getAddRemoveInsightsPermission },
    } = useUiFeatures()
    const permissions = getAddRemoveInsightsPermission(dashboard)

    return (
        <section className={styles.emptySection}>
            <Button
                type="button"
                disabled={permissions.disabled}
                variant="secondary"
                className="p-0 w-100 border-0"
                data-testid="add-insights-button-card"
                onClick={onAddInsightRequest}
            >
                <Tooltip content={permissions.tooltip} placement="right">
                    <Card className={styles.itemCard}>
                        <Icon svgPath={mdiPlus} inline={false} aria-hidden={true} height="2rem" width="2rem" />
                        <span>Add insights</span>
                    </Card>
                </Tooltip>
            </Button>
            <span className="d-flex justify-content-center mt-3">
                <Link to={encodeDashboardIdQueryParam('/insights/create', dashboard.id)}>or, create new insight</Link>
            </span>
        </section>
    )
}
