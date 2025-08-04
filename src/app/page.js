import Market from '@/components/home/Market'

export default function HomePage() {

  return (
    <div>
      <div className="relative bg-cover bg-center text-white pt-8 pb-4 text-center">
        <div className="absolute inset-0"></div>
        <div className="relative z-10">
          <h1 className="text-3xl font-bold mb-2">Explore Online Labs</h1>
          <p className="text-base">Discover and access laboratories from anywhere in the world.</p>
          <div className="mt-4 border-t-4 border-[#715c8c] w-80 mx-auto" />
        </div>
      </div>
      <Market />
    </div>
  )
}
