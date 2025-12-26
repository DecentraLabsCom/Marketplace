import dynamic from 'next/dynamic'

const Market = dynamic(() => import('@/components/home/Market'), {
  loading: () => (
    <div className="container mx-auto px-4 py-6">
      <div className="animate-pulse space-y-4">
        <div className="h-10 bg-white/10 rounded" />
        <div className="h-24 bg-white/10 rounded" />
        <div className="h-80 bg-white/10 rounded" />
      </div>
    </div>
  )
})

export default function HomePage() {

  return (
    <div>
      <div className="relative bg-cover bg-center text-white pt-8 pb-4 text-center">
        <div className="absolute inset-0"></div>
        <div className="relative z-10">
          <h1 className="text-3xl font-bold mb-2">Explore Online Labs</h1>
          <p className="text-base">Discover and access laboratories from anywhere in the world.</p>
          <div className="mt-4 border-t-4 border-brand w-80 mx-auto" />
        </div>
      </div>
      <Market />
    </div>
  )
}
