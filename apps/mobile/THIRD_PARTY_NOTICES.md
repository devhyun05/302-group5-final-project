# Third Party Notices

This mobile app includes the following third-party resources.

## Pretendard

- Source: https://github.com/orioncactus/pretendard
- License: SIL Open Font License 1.1
- Copyright: Copyright (c) 2021, Kil Hyung-jin and contributors.
- Usage: Bundled font files are used for the mobile app UI.

Notes:

- Commercial app use and bundling are allowed under the SIL Open Font License 1.1.
- The font software must not be sold by itself.
- Modified font versions must follow the Reserved Font Name rules in the license.

## Nixie One

- Source: https://github.com/google/fonts/tree/main/ofl/nixieone
- License: SIL Open Font License 1.1
- Usage: Bundled decorative font file is used for the mobile app UI.

Notes:

- Commercial app use and bundling are allowed under the SIL Open Font License 1.1.
- The font software must not be sold by itself.
- Keep the font license notice with distributions that include the font file.

## Lucide Icons

- Source: https://github.com/lucide-icons/lucide
- Package: lucide-react-native
- License: ISC
- Copyright: Copyright (c) Lucide Icons and contributors.
- Usage: Camera capture screen icons.

Notes:

- Commercial app use is allowed under the ISC license.
- Some Lucide icons are derived from Feather Icons and retain the Feather MIT license notice.

## Feather Icons

- Source: https://github.com/feathericons/feather
- License: MIT
- Copyright: Copyright (c) 2013-present Cole Bemis.
- Usage: Upstream attribution for Lucide icons derived from Feather Icons.

Notes:

- Commercial app use is allowed under the MIT license.
- Keep the copyright and permission notice with distributions that include derived icons.

## Tamagui

- Source: https://github.com/tamagui/tamagui
- Packages: `tamagui`, `@tamagui/config`, and related `@tamagui/*` packages
- License: MIT
- Usage: Mobile app UI primitives and styling helpers.

Notes:

- Commercial app use is allowed under the MIT license.
- Some Tamagui packages omit the `license` field in `package.json`, but the bundled package `LICENSE` files are MIT.

## React Native View Shot

- Source: https://github.com/gre/react-native-view-shot
- Package: `react-native-view-shot`
- License: MIT
- Usage: Capturing the face analysis report view as a shareable JPG image.

Notes:

- Commercial app use is allowed under the MIT license.
- Keep the copyright and permission notice with distributions that include the package.

## Current Dependency Audit Notes

- Direct runtime dependencies reviewed from `apps/mobile/package-lock.json` are MIT or ISC, except Tamagui packages whose bundled `LICENSE` files are MIT.
- Transitive package `node-forge` is dual-licensed as BSD-3-Clause or GPL-2.0. Use it under BSD-3-Clause for app distribution.
- No reviewed dependency is marked as non-commercial-only, no-derivatives-only, AGPL-only, or otherwise explicitly app-distribution-prohibited.
