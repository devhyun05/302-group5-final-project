# AURA v1.0 Mobile Frontend Guide

## Current Product Scope

AURA v1.0 is a local, survey-based beauty reference app for iOS.

The app does not include login, signup, backend API calls, camera capture, photo upload, AI image analysis, Unity, ARKit, ARCore, or AR makeup filters.

The user flow is:

```text
Tutorial
-> LocalBeautySurvey
-> LocalBeautySurveyResult
```

The current feature lives in `apps/mobile/src/features/local-beauty-analysis`.

## Required References

- `docs/planning/LOCAL_PERSONAL_COLOR_FACE_IMAGE_ANALYSIS_DESIGN.md`
- `docs/planning/LOCAL_BEAUTY_SURVEY_QUESTION_LOGIC.md`
- `docs/planning/APP_STORE_SUBMISSION_COPY.md`

These documents define the v1.0 behavior, App Store messaging, and review notes.

## Mobile Frontend Rules

- Work in `apps/mobile/src`.
- Use the existing React Native, TypeScript, React Navigation, Expo, and Tamagui stack.
- Do not add new UI libraries, icon libraries, analytics SDKs, backend SDKs, camera SDKs, or AI SDKs.
- Keep reusable UI in `shared/ui`.
- Keep tokens in `shared/theme`.
- Keep feature code in `features/local-beauty-analysis` and `features/onboarding`.
- Keep API-replaceable logic in service files, not directly inside screens.
- Use local mock/scoring/service logic only.

## Design Tokens

- Use Pretendard through `shared/theme/typography.ts`.
- Do not hardcode repeated font sizes, font weights, spacing, radius, colors, shadows, or icon sizes in screens.
- Use Tamagui for common UI.
- Use Lucide icons or the shared icon system.
- Do not use text characters as icons.

## v1.0 Feature Boundaries

Allowed:

- Intro/tutorial screen
- Local beauty survey
- Survey draft save and resume
- Recent local result save and reopen
- Result report
- Result image capture for native iOS sharing
- Privacy policy and license links

Not allowed in this branch:

- Login or account flows
- Signup
- Social login
- User profile editing
- Camera capture
- Photo library upload
- Face recognition
- AI server calls
- OpenAI API calls from the app
- Backend API integration
- Product recommendation screens
- AR filter screens
- Unity or native AR code
- Celebrity, influencer, actor, lookalike, SNS handle, logo, or watermark features

## Data And Privacy

- Survey answers and recent results stay on device.
- Do not send survey answers, images, or results to a server.
- Do not collect names, emails, phone numbers, location, or photos.
- SecureStore is used only for local draft/result convenience.
- Result sharing must remain user-initiated through the native iOS share sheet.

## Code Quality

- Prefer existing patterns and helpers over new abstractions.
- Avoid `any`, unused code, temporary logs, and broad refactors unrelated to the task.
- Keep screens focused on rendering and navigation.
- Keep scoring, storage, presentation mapping, and sharing helpers in services.
- Add focused tests for scoring, result presentation, storage normalization, navigation params, and share behavior when those areas change.
- Run `npm run typecheck` in `apps/mobile` when mobile code changes.

## App Store Review Notes

App Store metadata and review notes must describe only the current v1.0 app:

- No login or demo account required
- No camera permission required
- No photo upload
- No backend server
- No AI image analysis
- No AR filter
- Survey-based local beauty reference result only

Use `docs/planning/APP_STORE_SUBMISSION_COPY.md` as the source for submission copy.
