import type { ReactNode } from 'react';
import { openExternal } from './open-tab';

/** Link to a job post that always opens in a new tab (https only). */
export function JobLink(props: { url: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={props.url}
      className={props.className}
      target="_blank"
      rel="noreferrer"
      title="Open the job post in a new tab"
      onClick={(e) => {
        e.preventDefault();
        openExternal(props.url);
      }}
    >
      {props.children}
    </a>
  );
}
