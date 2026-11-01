# Extension-page UI

`src/ui` holds the Svelte views for the popup, settings and the first-run page (06 §6.4.4). This unit adds the shared controls in `components/`, the tokens in `lib/theme.css` and the first-run page in `onboarding/`.

## The first-run seam

`FirstRun.svelte` takes two props: `owner`, a `FirstRunOwner` from `onboarding/owner.ts`, and `markSrc`, the URL of the packaged `src/assets/brand/icon.svg`. The page's entry imports the mark, because `src/ui` may import only `src/shared` and `src/ui`.

Components never touch storage, permissions, tabs, cookies or YouTube. Every effect goes through the owner, and the view shows only what the owner confirms:

- `lookupSyncedChoices()` is the one read before consent (`ui.syncedChoices`, ARC-MSG-12). It returns a cancellable lookup.
- `requestPermissions(needs)` runs inside the Agree click, before anything is awaited. Its promise goes into `agree()` unawaited, matching `AgreementInput.access` in `background/store/consent-agreement.ts`.
- `agree(request)` answers with the request's `attempt`. Only `agreed`, for that attempt and exactly the ticked features, opens step 3. A denied prompt still answers `agreed`, with the affected features saved on and held (FT-40, FT-52).
- `readSetup()`, `requestSiteAccess(site)`, `choosePlaylist(request)` and `open(destination)` serve step 3. `choosePlaylist` is where the shared picker plugs in. It answers `picker-unavailable` until that picker exists.

The later browser `Backend` adapter implements `FirstRunOwner` over the accepted store operations. The flow and setup state live per page instance in `onboarding/flow.svelte.ts` and `onboarding/setup.svelte.ts`.

## Copy

All first-run text is in `onboarding/copy.ts` and `onboarding/features.ts`, never inline in a component. ARC-MOD-35 moves it to `_locales/en/messages.json` through `shared/i18n` once that catalogue exists. The disclosure's cookie line is marked `provisional: "ticket-25-cookie"` and renders with `data-provisional`, because R48 may remove it. Privacy wording approval is still pending.
