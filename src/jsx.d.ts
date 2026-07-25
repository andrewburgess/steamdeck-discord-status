/**
 * React 19 removed the global `JSX` namespace in favour of `React.JSX`.
 *
 * This project compiles with `jsx: "react"` and a custom factory
 * (`window.SP_REACT.createElement`), because Decky provides React as a global
 * rather than a bundled import. That mode makes TypeScript resolve JSX types
 * through the *global* namespace, which no longer exists -- hence TS7026 on
 * every intrinsic element. Point the global names back at React's.
 */
import type { JSX as ReactJSX } from 'react';

declare global {
    namespace JSX {
        type ElementType = ReactJSX.ElementType;
        type LibraryManagedAttributes<C, P> = ReactJSX.LibraryManagedAttributes<C, P>;

        interface Element extends ReactJSX.Element {}
        interface ElementClass extends ReactJSX.ElementClass {}
        interface ElementAttributesProperty extends ReactJSX.ElementAttributesProperty {}
        interface ElementChildrenAttribute extends ReactJSX.ElementChildrenAttribute {}
        interface IntrinsicAttributes extends ReactJSX.IntrinsicAttributes {}
        interface IntrinsicClassAttributes<T> extends ReactJSX.IntrinsicClassAttributes<T> {}
        interface IntrinsicElements extends ReactJSX.IntrinsicElements {}
    }
}
