import * as onboarding from './index';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Expect<Value extends true> = Value;

type ActiveOnboardingExport =
  | 'TutorialIntroScreen'
  | 'getTutorialIntroHeroContent'
  | 'getTutorialIntroLegalLinks'
  | 'getTutorialIntroLayoutIntent';

type _OnboardingExportsStayFocused = Expect<
  Equal<keyof typeof onboarding, ActiveOnboardingExport>
>;
