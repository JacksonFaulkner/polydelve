import { source } from '@/lib/source';
import {
  DocsPage,
  DocsBody,
  DocsTitle,
  DocsDescription,
} from 'fumadocs-ui/page';
import type { ComponentProps } from 'react';
import { notFound } from 'next/navigation';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { Mermaid } from '@/app/components/Mermaid';
import { ModelReference } from '@/app/components/ModelReference';

// fumadocs' img (next/image) needs a width. Remote images get one from the
// build-time size probe; when the host is unreachable (e.g. not uploaded yet)
// fall back to a plain <img> instead of crashing the page.
const DefaultImg = defaultMdxComponents.img as (props: ComponentProps<'img'>) => React.ReactNode;
function Img(props: ComponentProps<'img'>) {
  if (props.width) return <DefaultImg {...props} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={props.alt ?? ''} loading="lazy" style={{ maxWidth: '100%', height: 'auto', borderRadius: 8 }} />;
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={{
            ...defaultMdxComponents,
            img: Img,
            Mermaid,
            ModelReference,
            Step,
            Steps,
            Accordion,
            Accordions,
            Tab,
            Tabs,
          }}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
