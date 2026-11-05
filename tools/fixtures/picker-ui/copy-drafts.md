# Picker copy requiring approval

The catalogue preserves every existing message and placeholder. It adds settled picker copy and draft helper copy. Draft status does not establish privacy wording approval.

The following additions need later copy approval. They decide no first-pick policy. R171 to R173 settled those on 2026-11-01.

| Keys | Draft scope |
|---|---|
| `picker_manyTitle` | Generic many-mode panel heading. |
| `picker_listLabel`, `picker_close`, `picker_titleUnavailable`, `picker_unknownPrivacy`, `picker_chooserName`, `picker_shortcutLabel`, `picker_removeChoice`, `picker_pinFor`, `picker_pinnedFor` | Accessible names and unavailable supplied facts. |
| `picker_noSavedList`, `picker_noTab`, `picker_loadingList`, `picker_listUnavailable`, `picker_emptyList`, `picker_emptySearch`, `picker_refreshFailed` | List, search, and missing-data states. |
| `picker_busy`, `picker_removed`, `picker_refused_*`, `picker_createChoiceRefused`, `picker_sortPending`, `picker_sortRefused` | In-place operation and refusal states. No first-pick toast or saved-default promise. |
| `picker_required`, `picker_tooLong`, `picker_creation_private`, `picker_noneChosen` | Form validation, unavailable empty creation, and absent current choice. |

The specification's exact gather, quick-save, creation failure, duplicate-title, angle-bracket, visibility, refresh, sort, mark, and Watch later wording stays as specified. Singular and plural count variants use the shared `Intl.PluralRules` wrapper.

The owner approved `picker_pickedPrivate` ("Saved. Private windows don't keep your playlist choice.") with R171. A refused choice after a confirmed save reuses the approved `feedback_*_saved` and `feedback_*_already_in` lines, the `picker_refused_*` lines, `toast_action_undo`, `toast_action_try_again` and "Couldn't undo." (R172). The caller receives every typed outcome and owns release timing.
