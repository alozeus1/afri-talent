import { Fragment, type ReactNode } from "react";

/**
 * Render a translated string that contains simple inline tags, e.g.
 * `"See our <link>Cookies Policy</link> for details."`, by mapping each tag
 * name to a renderer. Tags are not nested; unknown tags render their text.
 * Keeps sentence order inside the translation, so RTL and word order work.
 */
export function richText(
  text: string,
  renderers: Record<string, (chunk: string) => ReactNode> = {},
): ReactNode {
  const parts: ReactNode[] = [];
  const pattern = /<(\w+)>(.*?)<\/\1>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const [, tag, chunk] = match;
    const render = renderers[tag] ?? (tag === "b" ? (c: string) => <strong className="font-semibold text-fg">{c}</strong> : undefined);
    parts.push(<Fragment key={index++}>{render ? render(chunk) : chunk}</Fragment>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
