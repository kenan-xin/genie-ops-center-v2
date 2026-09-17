import data from '@/../product/sections/account-and-inbox/data.json'
import { SolutionsEmptyState } from './components/SolutionsEmptyState'

export default function SolutionsEmptyStatePreview() {
  return <SolutionsEmptyState copy={data.emptyStates.noSolutions} support={data.tenantSupport} />
}
