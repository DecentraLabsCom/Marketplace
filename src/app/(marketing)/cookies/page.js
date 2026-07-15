import GovernancePage from '@/components/governance/GovernancePage'

export const metadata = {
  title: 'Cookies | DecentraLabs Marketplace',
  description: 'Cookies and browser storage notice for DecentraLabs Marketplace.',
}

export default function CookiesPage() {
  return <GovernancePage kind="cookies" />
}
