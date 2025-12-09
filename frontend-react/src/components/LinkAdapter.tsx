import React from 'react';
import { Link as ReactRouterLink } from 'react-router-dom';
import type { LinkLikeComponentProps } from '@shopify/polaris/build/ts/src/utilities/link';

// Adattatore per far usare React Router ai componenti Polaris
export const LinkAdapter = React.forwardRef<HTMLAnchorElement, LinkLikeComponentProps>(
  ({ children, url = '', external, ...rest }, ref) => {
    // Se è un link esterno, usa il tag <a> normale
    if (external || url.startsWith('http')) {
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          ref={ref}
          {...rest}
        >
          {children}
        </a>
      );
    }

    // Altrimenti usa il Link di React Router per navigazione SPA fluida
    return (
      <ReactRouterLink
        to={url}
        ref={ref}
        {...rest as any} // Cast necessario per compatibilità props
      >
        {children}
      </ReactRouterLink>
    );
  }
);
