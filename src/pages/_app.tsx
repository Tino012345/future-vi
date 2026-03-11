import type { AppProps } from "next/app";
import "./_global.css";
import Head from "next/head";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Future Vision Suite</title>
        <meta name="description" content="Analysez vos idées, trouvez des produits gagnants, planifiez votre lancement — propulsé par Claude." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
