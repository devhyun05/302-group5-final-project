import * as sharedUi from './index';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Expect<Value extends true> = Value;

type ActiveSharedUiExport =
  | 'AppHeader'
  | 'AppScreen'
  | 'AuraLogo'
  | 'ChevronLeftIcon'
  | 'XIcon';

type _SharedUiExportsStayFocused = Expect<
  Equal<keyof typeof sharedUi, ActiveSharedUiExport>
>;
