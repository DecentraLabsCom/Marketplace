import GovernancePage from '@/components/governance/GovernancePage'

export const metadata = {
  title: 'Security | DecentraLabs Marketplace',
  description: 'Security controls and responsible disclosure information for DecentraLabs Marketplace.',
}

export default function SecurityPage() {
  return <GovernancePage kind="security" />
}
