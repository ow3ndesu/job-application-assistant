import { useState, type FormEvent } from 'react';
import type { SearchKeywords } from '@/core/domain';
import { addKeyword, removeKeyword, type KeywordKind } from '@/core/use-cases/keywords';
import { describeError, LoadError, Message, Section } from '@/ui/components';
import { repos } from '@/ui/services';
import { useResource } from '@/ui/useResource';

const loadKeywords = () => repos.searchKeywords.get();

export function KeywordsSection() {
  const { state, reload } = useResource(loadKeywords);
  const [error, setError] = useState<string | null>(null);

  async function save(next: SearchKeywords) {
    setError(null);
    try {
      await repos.searchKeywords.set(next);
      reload();
    } catch (e) {
      setError(describeError(e));
    }
  }

  return (
    <Section
      id="keywords"
      title="Keywords"
      intro="Jobs matching any keyword are kept; jobs containing an exclusion are skipped."
    >
      {state.status === 'loading' && <p className="muted">Loading…</p>}
      {state.status === 'error' && (
        <LoadError
          error={state.error}
          onRecover={async () => {
            await repos.searchKeywords.reset();
            reload();
          }}
        />
      )}
      {state.status === 'ready' && (
        <div className="two-col">
          <KeywordList
            kind="include"
            title="Keywords"
            keywords={state.data}
            onChange={save}
            onError={setError}
          />
          <KeywordList
            kind="exclude"
            title="Exclusions"
            keywords={state.data}
            onChange={save}
            onError={setError}
          />
        </div>
      )}
      {error && <Message kind="error">{error}</Message>}
    </Section>
  );
}

function KeywordList(props: {
  kind: KeywordKind;
  title: string;
  keywords: SearchKeywords;
  onChange: (next: SearchKeywords) => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [value, setValue] = useState('');
  const list = props.keywords[props.kind];

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const result = addKeyword(props.keywords, props.kind, value);
    if (!result.ok) {
      props.onError(result.error);
      return;
    }
    setValue('');
    void props.onChange(result.value);
  }

  return (
    <div data-testid={`keywords-${props.kind}`}>
      <h3>{props.title}</h3>
      {list.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <ul className="chips">
          {list.map((k) => (
            <li key={k} className="chip">
              {k}
              <button
                type="button"
                aria-label={`Remove ${k}`}
                onClick={() => void props.onChange(removeKeyword(props.keywords, props.kind, k))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="inline-form" onSubmit={onSubmit} aria-label={`Add to ${props.title}`}>
        <input
          type="text"
          value={value}
          maxLength={100}
          placeholder={props.kind === 'include' ? 'e.g. virtual assistant' : 'e.g. cold calling'}
          aria-label={`New ${props.title.toLowerCase()} entry`}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit">Add</button>
      </form>
    </div>
  );
}
