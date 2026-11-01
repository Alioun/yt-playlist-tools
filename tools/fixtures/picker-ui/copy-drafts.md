# Picker copy requiring approval

The catalogue preserves every existing message and placeholder. It adds settled picker copy and draft helper copy. Draft status does not establish privacy wording approval.

The following additions need later copy approval. They do not decide any pending first-pick policy.

| Keys | Draft scope |
|---|---|
| `picker_manyTitle` | Generic many-mode panel heading. |
| `picker_listLabel`, `picker_close`, `picker_titleUnavailable`, `picker_unknownPrivacy`, `picker_chooserName`, `picker_shortcutLabel`, `picker_removeChoice`, `picker_pinFor`, `picker_pinnedFor` | Accessible names and unavailable supplied facts. |
| `picker_noSavedList`, `picker_noTab`, `picker_loadingList`, `picker_listUnavailable`, `picker_emptyList`, `picker_emptySearch`, `picker_refreshFailed` | List, search, and missing-data states. |
| `picker_busy`, `picker_removed`, `picker_refused_*`, `picker_createChoiceRefused`, `picker_sortPending`, `picker_sortRefused` | In-place operation and refusal states. No first-pick toast or saved-default promise. |
| `picker_required`, `picker_tooLong`, `picker_creation_private`, `picker_noneChosen` | Form validation, unavailable empty creation, and absent current choice. |

The specification's exact gather, quick-save, creation failure, duplicate-title, angle-bracket, visibility, refresh, sort, mark, and Watch later wording stays as specified. Singular and plural count variants use the shared `Intl.PluralRules` wrapper.

The three pending policies retain their original register. This candidate supplies no default private first-pick confirmation. It displays actual choice refusals without deciding the partial-save toast or close policy. The caller receives every typed outcome and owns release timing.
