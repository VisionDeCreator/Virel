import type { ButtonHTMLAttributes, ReactNode } from "react";
export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`button ${props.className ?? ""}`} />;
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="empty-state">
      <span className="eyebrow">VIREL</span>
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}
