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
