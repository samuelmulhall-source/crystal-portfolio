import Link from "next/link";
import st from "./components/lit/lit.module.css";

export default function NotFound() {
  return (
    <main className={st.root} style={{ ["--f1" as string]: "#0e0d0c", ["--f2" as string]: "#080706" }}>
      <section className={st.nf}>
        <p className={st.idx}>
          <span className={st.fig}>404</span>Not found
        </p>
        <h1 className={st.title}>That page does not exist.</h1>
        <p className={st.sum}>The link may be old or mistyped. Every piece lives in the index.</p>
        <Link href="/">See all work</Link>
      </section>
    </main>
  );
}
