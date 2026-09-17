import { useState } from 'react'
import data from '@/../product/sections/branding/data.json'
import type { ApprovedFont, Branding, BrandingImage, BrandingTab, ContrastTargets, LastPublish, LocaleOptions, UploadPolicy } from '@/../product/sections/branding/types'
import { BrandingPage } from './components/BrandingPage'

// ?tab=identity|colors|typography|signin|email|links|locale &primary=failing &text=failing &dialog=publish|discard
// &upload=progress|infected &preview=light|dark
export default function BrandingPagePreview() {
  const q = new URLSearchParams(window.location.search)
  const [branding, setBranding] = useState(data.branding as Branding)
  const [last, setLast] = useState(data.lastPublish as LastPublish)
  const [key, setKey] = useState(0)

  // The failing-contrast state is a draft edit, not the published sample: the published primary passes AA.
  const initialDraft = { ...(q.get('primary') === 'failing' ? { primaryColor: '#7c3aed' } : null), ...(q.get('text') === 'failing' ? { textColor: '#9ca3af' } : null) }

  return (
    <BrandingPage
      key={key}
      branding={branding}
      images={data.images as BrandingImage[]}
      uploadPolicy={data.uploadPolicy as UploadPolicy}
      approvedFonts={data.approvedFonts as ApprovedFont[]}
      localeOptions={data.localeOptions as LocaleOptions}
      lastPublish={last}
      contrastTargets={data.contrastTargets as ContrastTargets}
      initialTab={(q.get('tab') as BrandingTab | null) ?? undefined}
      initialDraft={initialDraft}
      initialDialog={(q.get('dialog') as 'publish' | 'discard' | null) ?? undefined}
      initialUpload={q.get('upload') === 'progress' ? 'uploading' : q.get('upload') === 'infected' ? 'infected' : undefined}
      initialPreviewTheme={(q.get('preview') as 'light' | 'dark' | null) ?? undefined}
      onPublish={(draft, changed) => {
        console.log('Publish:', changed)
        setBranding(draft)
        setLast({ by: 'Priya Nair', at: new Date().toISOString(), changedFields: changed })
        setKey((k) => k + 1)
      }}
      onDiscard={() => console.log('Discard draft')}
      onUploadImage={(kind, file) => console.log('Upload', kind, file.name)}
      onRemoveImage={(kind) => console.log('Remove', kind)}
    />
  )
}
