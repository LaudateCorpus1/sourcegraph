import React, { useCallback } from 'react'

import { ContentMatch, SearchMatch } from '@sourcegraph/shared/src/search/stream'

import { getResultId } from './utils'

import styles from './SelectableSearchResult.module.scss'

interface Props {
    children: (isActive: boolean) => React.ReactNode
    lineMatchOrSymbolName?: ContentMatch['lineMatches'][0] | string
    match: SearchMatch
    selectedResult: null | string
    selectResult: (id: string) => void
}

export const SelectableSearchResult: React.FunctionComponent<Props> = ({
    children,
    lineMatchOrSymbolName,
    match,
    selectedResult,
    selectResult,
}: Props) => {
    const resultId = getResultId(match, lineMatchOrSymbolName)
    const onClick = useCallback((): void => selectResult(resultId), [selectResult, resultId])
    const isActive = resultId === selectedResult

    return (
        // The below element's accessibility is handled via a document level event listener.
        //
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events,jsx-a11y/no-static-element-interactions
        <div
            id={`search-result-list-item-${resultId}`}
            className={styles.selectableSearchResult}
            onClick={onClick}
            key={resultId}
        >
            {children(isActive)}
        </div>
    )
}