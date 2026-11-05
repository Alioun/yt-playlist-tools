import type { FeatureSettingChange, FeatureSettingAnswer, SharedSettingChange, SharedSettingAnswer } from "../../shared/contracts/shared-settings"
import type { KeySettingChange, KeySettingAnswer } from "../../shared/contracts/key-settings"
import type { Settings } from "../../shared/model"
import type { Snapshot } from "../../shared/model/settings-view"
import type { UiPlaylistOperation } from "./playlist-list/operation"
import type { UiMessages } from "../../shared/contracts/ui"
import type { AccountKey } from "../../shared/model/validation"
import type { UiCreationAnswer, UiNewPlaylist } from "../../shared/contracts/ui-playlists"
import type { AgreeChange, AgreementAnswer, DestinationChange, DestinationAnswer, PermissionGrant, PermissionNeeds } from "../../shared/contracts/first-run"
import type { Site, BuildId } from "../../shared/contracts/vocabulary"
import type { ReadScope, UiSnapshot } from "../../shared/model/first-run-view"
import type { PageView } from "../../shared/model/page-view"
import type { Deadline, RpcOutcome } from "../../shared/rpc/rpc"
import type { ClearAllPayload, ClearAllAnswer } from "../../shared/contracts/clear-all"
import type { GatherPush } from "../../shared/contracts/ui-gather"

import type { AutoAddReadChange, AutoAddReadAnswer, AutoAddChoiceChange, AutoAddChoiceAnswer } from "../../shared/contracts/auto-add-choice"
export type { AutoAddReadChange, AutoAddReadAnswer, AutoAddChoiceChange, AutoAddChoiceAnswer, AutoAddEdit, AutoAddFact } from "../../shared/contracts/auto-add-choice"

export type { UiSnapshot, ReadScope } from "../../shared/model/first-run-view"
export type { PageView, PageSetup, PageDevice } from "../../shared/model/page-view"
export type { AgreeChange, AgreementAnswer, Change, DestinationChange, DestinationAnswer } from "../../shared/contracts/first-run"
export type UiCall = keyof UiMessages
export type UiArgs<K extends UiCall> = UiMessages[K]["payload"]
export type UiResult<K extends UiCall> = RpcOutcome<UiMessages[K]["result"]>
export type UiEvent = { readonly kind: "view"; readonly snapshot: UiSnapshot }
export type PageEvent = { readonly kind: "page"; readonly view: PageView }
export type LocalChange = { readonly [key: string]: { readonly oldValue?: unknown; readonly newValue?: unknown } }
export type LocalListener = (changes: LocalChange, areaName: string) => void
export type ReadOnlyLocal = {
  get(keys: readonly string[]): Promise<Readonly<Record<string, unknown>>>
  /** Every record, for the one page-view read (UI-POP-02). The page keeps only the records it shows. */
  all(): Promise<Readonly<Record<string, unknown>>>
  readonly onChanged: { addListener(listener: LocalListener): void; removeListener(listener: LocalListener): void }
}
export type Access = {
  has(site: Site): Promise<boolean>
  request(site: Site): Promise<boolean>
  requestCombined(needs: PermissionNeeds): Promise<PermissionGrant>
  hasBrowserMenu(): Promise<boolean>
}
export type UiCreation = {
  submit(playlist: UiNewPlaylist): Promise<RpcOutcome<UiCreationAnswer>>
  status(): Promise<RpcOutcome<UiCreationAnswer>>
  dispose(): void
}
export type Backend = {
  clearAll(payload: ClearAllPayload): Promise<RpcOutcome<ClearAllAnswer>>
  readonly keys: import("./key-settings").KeySettingsSource
  changeFeatureSetting(change: FeatureSettingChange, settings: Snapshot<Settings>): Promise<FeatureSettingAnswer>
  load(scope?: ReadScope): Promise<UiSnapshot>
  watch(fn: (event: UiEvent) => void, scope?: ReadScope): () => void
  /** The popup's and settings' whole view, from one `storage.local` read (UI-POP-02). */
  loadPage(): Promise<PageView>
  watchPage(fn: (event: PageEvent) => void): () => void
  change(change: AgreeChange): Promise<AgreementAnswer>
  change(change: DestinationChange): Promise<DestinationAnswer>
  change(change: AutoAddReadChange): Promise<AutoAddReadAnswer>
  change(change: AutoAddChoiceChange): Promise<AutoAddChoiceAnswer>
  change(change: FeatureSettingChange): Promise<FeatureSettingAnswer>
  change(change: SharedSettingChange): Promise<SharedSettingAnswer>
  change(change: KeySettingChange): Promise<KeySettingAnswer>
  call<K extends UiCall>(kind: K, args: UiArgs<K>): Promise<UiResult<K>>
  /** Gather tabs' pushes, `ui.gatherProgress` (ARC-MSG-16). A listener answers true when it showed a result, which only the popup on that window does. */
  watchGather(fn: (push: GatherPush) => boolean): () => void
  playlistList(request: { readonly acct: AccountKey; readonly site: Site; readonly refresh?: boolean }): UiPlaylistOperation
  creation(request: { readonly acct: AccountKey; readonly site: Site }): UiCreation
  readonly access: Access
  dispose(): void
}
export type BackendOptions = {
  readonly build: BuildId
  readonly deadline: Deadline
  readonly windowId?: number
}
export type BackendPorts = {
  readonly local: ReadOnlyLocal
  readonly send: (message: unknown) => Promise<unknown>
  readonly access: Access
  /** Messages the background sends to extension pages; the adapter passes on only the background's own. */
  readonly pushes?: { listen(receive: (message: unknown) => unknown): () => void }
}
