import classNames from 'classnames'
import { Remote } from 'comlink'
import * as H from 'history'
import MagnifyIcon from 'mdi-react/MagnifyIcon'
import React, { useMemo, useCallback, useEffect, useRef } from 'react'
import { Modal } from 'reactstrap'
import { from, Observable } from 'rxjs'
import { filter, map, switchMap } from 'rxjs/operators'

import { ActionItemAction } from '../../actions/ActionItem'
import { wrapRemoteObservable } from '../../api/client/api/common'
import { FlatExtensionHostAPI } from '../../api/contract'
import { haveInitialExtensionsLoaded } from '../../api/features'
import { ContributableMenu } from '../../api/protocol'
import { getContributedActionItems } from '../../contributions/contributions'
import { ExtensionsControllerProps } from '../../extensions/controller'
import { PlatformContextProps } from '../../platform/context'
import { TelemetryProps } from '../../telemetry/telemetryService'
import { memoizeObservable } from '../../util/memoizeObservable'
import { useObservable } from '../../util/useObservable'

import styles from './CommandPalette.module.scss'
import { CommandPaletteModesResult } from './components/CommandPaletteModesResult'
import { CommandResult } from './components/CommandResult'
import { FuzzyFinderResult } from './components/FuzzyFinderResult'
import { JumpToLineResult } from './components/JumpToLineResult'
import { JumpToSymbolResult } from './components/JumpToSymbolResult'
import { RecentSearchesResult } from './components/RecentSearchesResult'
import { ShortcutController } from './components/ShortcutController'
import {
    COMMAND_PALETTE_SHORTCUTS,
    CommandPaletteMode,
    BUILT_IN_ACTIONS,
    KeyboardShortcutWithCallback,
} from './constants'
import { useCommandPaletteStore } from './store'

const getMode = (text: string): CommandPaletteMode | undefined =>
    Object.values(CommandPaletteMode).find(value => text.startsWith(value))

// Memoize contributions to prevent flashing loading spinners on subsequent mounts
const getContributions = memoizeObservable(
    (extensionHostAPI: Promise<Remote<FlatExtensionHostAPI>>) =>
        from(extensionHostAPI).pipe(switchMap(extensionHost => wrapRemoteObservable(extensionHost.getContributions()))),
    () => 'getContributions' // only one instance
)

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function useCommandList(value: string, extensionsController: CommandPaletteProps['extensionsController']) {
    const extensionContributions = useObservable(
        useMemo(
            () =>
                haveInitialExtensionsLoaded(extensionsController.extHostAPI).pipe(
                    // Don't listen for contributions until all initial extensions have loaded (to prevent UI jitter)
                    filter(haveLoaded => haveLoaded),
                    switchMap(() => getContributions(extensionsController.extHostAPI))
                ),
            [extensionsController]
        )
    )

    // Built in action items

    const actions = useMemo(
        () => [
            ...(extensionContributions
                ? getContributedActionItems(extensionContributions, ContributableMenu.CommandPalette)
                : []),
            ...BUILT_IN_ACTIONS,
        ],
        // TODO: combine and map all actionItems
        [extensionContributions]
    )

    const onRunAction = useCallback(
        ({ action }: ActionItemAction) => {
            if (!action.command) {
                // Unexpectedly arrived here; noop actions should not have event handlers that trigger
                // this.
                return
            }

            extensionsController
                .executeCommand({ command: action.command, args: action.commandArguments })
                .catch(error => console.error(error))

            // TODO update recent actions
        },
        [extensionsController]
    )

    const shortcuts = useMemo((): KeyboardShortcutWithCallback[] => {
        const actionsWithShortcuts: KeyboardShortcutWithCallback[] = actions
            .filter(({ keybinding }) => !!keybinding)
            .map(action => ({
                keybindings: action.keybinding ? [action.keybinding] : [],
                onMatch: () => onRunAction(action),
                id: action.action.id,
                title: action.action.title ?? action.action.actionItem?.label ?? '',
            }))

        return [...COMMAND_PALETTE_SHORTCUTS, ...actionsWithShortcuts]
    }, [actions, onRunAction])

    return { actions, shortcuts, onRunAction }
}

export interface CommandPaletteProps
    extends ExtensionsControllerProps<'extHostAPI' | 'executeCommand'>,
        PlatformContextProps<
            'forceUpdateTooltip' | 'settings' | 'requestGraphQL' | 'clientApplication' | 'sourcegraphURL' | 'urlToFile'
        >,
        TelemetryProps {
    initialIsOpen?: boolean
    location: H.Location
    // TODO: different for web and bext. change name
    getAuthenticatedUserID: Observable<string | null>
}

/**
 * EXPERIMENTAL: New command palette (RFC 467)
 *
 * TODO: WRAP WITH ERROR BOUNDARY AT ALL CALL SITES
 *
 * @description this is a singleton component that is always rendered.
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({
    initialIsOpen = false,
    // TODO: add ability to set default/initial mode
    extensionsController,
    platformContext,
    telemetryService,
    location,
    getAuthenticatedUserID,
}) => {
    const { isOpen, toggleIsOpen, value, setValue } = useCommandPaletteStore()
    const { actions, shortcuts, onRunAction } = useCommandList(value, extensionsController)
    const inputReference = useRef<HTMLInputElement>(null)
    const mode = getMode(value)

    useEffect(() => {
        if (initialIsOpen) {
            toggleIsOpen()
        }
    }, [toggleIsOpen, initialIsOpen])

    const handleClose = useCallback(() => {
        toggleIsOpen()
    }, [toggleIsOpen])

    const handleInputFocus = useCallback(() => {
        inputReference.current?.focus()
    }, [])

    const handleChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            setValue(event.target.value)
        },
        [setValue]
    )

    const activeTextDocument = useObservable(
        useMemo(
            () =>
                from(extensionsController.extHostAPI).pipe(
                    switchMap(extensionHostAPI => wrapRemoteObservable(extensionHostAPI.getActiveTextDocument()))
                ),
            [extensionsController]
        )
    )

    const workspaceRoot = useObservable(
        useMemo(
            () =>
                from(extensionsController.extHostAPI).pipe(
                    switchMap(extensionHostAPI => wrapRemoteObservable(extensionHostAPI.getWorkspaceRoots())),
                    map(workspaceRoots => workspaceRoots[0])
                ),
            [extensionsController]
        )
    )

    const searchText = mode ? value.slice(1) : value

    return (
        <>
            <ShortcutController shortcuts={shortcuts} />
            {/* Can be rendered at the main app shell level */}

            <Modal
                isOpen={isOpen}
                toggle={() => {
                    toggleIsOpen()
                }}
                autoFocus={false}
                backdropClassName="bg-transparent" // TODO: remove utility classes for bext
                keyboard={true}
                fade={false}
                className={classNames(styles.modalDialog, 'shadow-lg')} // TODO: remove utility classes for bext
                contentClassName={styles.modalContent}
            >
                <div className={styles.inputContainer}>
                    <MagnifyIcon className={styles.inputIcon} />
                    <input
                        ref={inputReference}
                        autoComplete="off"
                        spellCheck="false"
                        aria-autocomplete="list"
                        className={classNames(styles.input, 'form-control py-1')} // TODO: remove utility classes for bext
                        // TODO: different placeholder by mode
                        placeholder="Select a mode (prefix or click)"
                        value={value}
                        onChange={handleChange}
                        autoFocus={true}
                        type="text"
                    />
                </div>
                {!mode && <CommandPaletteModesResult onSelect={handleInputFocus} />}
                {mode === CommandPaletteMode.Command && (
                    <CommandResult
                        actions={actions}
                        value={searchText}
                        onRunAction={action => {
                            onRunAction(action)
                            handleClose()
                        }}
                    />
                )}
                {mode === CommandPaletteMode.RecentSearches && (
                    <RecentSearchesResult
                        value={searchText}
                        onClick={handleClose}
                        getAuthenticatedUserID={getAuthenticatedUserID}
                        platformContext={platformContext}
                    />
                )}
                {/* TODO: Only when repo open */}
                {mode === CommandPaletteMode.Fuzzy && (
                    <FuzzyFinderResult
                        value={searchText}
                        onClick={handleClose}
                        workspaceRoot={workspaceRoot}
                        platformContext={platformContext}
                    />
                )}
                {/* TODO: Only when code editor open (possibly only when single open TODO) */}
                {mode === CommandPaletteMode.JumpToLine && (
                    <JumpToLineResult value={searchText} onClick={handleClose} textDocumentData={activeTextDocument} />
                )}
                {mode === CommandPaletteMode.JumpToSymbol && (
                    <JumpToSymbolResult
                        value={searchText}
                        onClick={handleClose}
                        textDocumentData={activeTextDocument}
                        platformContext={platformContext}
                    />
                )}
            </Modal>
        </>
    )
}
