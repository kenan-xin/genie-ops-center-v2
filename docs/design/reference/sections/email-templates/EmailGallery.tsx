import data from '@/../product/sections/email-templates/data.json'
import type { BodyView, EmailSampleValues, EmailTemplate, EmailTenant, FrameWidth } from '@/../product/sections/email-templates/types'
import { EmailGallery } from './components/EmailGallery'

// ?t=<templateId>&tenant=<tenantId>&width=phone|desktop&view=html|text
export default function EmailGalleryPreview() {
  const q = new URLSearchParams(window.location.search)
  return (
    <EmailGallery
      tenants={data.tenants as EmailTenant[]}
      templates={data.templates as EmailTemplate[]}
      sampleValues={data.sampleValues as EmailSampleValues}
      reviewerEmail={data.reviewerEmail}
      initialTemplateId={q.get('t')}
      initialTenantId={q.get('tenant')}
      initialWidth={(q.get('width') as FrameWidth | null) ?? undefined}
      initialView={(q.get('view') as BodyView | null) ?? undefined}
      onSendTest={(templateId, tenantId) => console.log('Send test:', templateId, tenantId)}
      onCopyPlainText={(templateId) => console.log('Copied plain text:', templateId)}
    />
  )
}
