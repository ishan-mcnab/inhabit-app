type TabPlaceholderProps = {
  title: string
}

export function TabPlaceholder({ title }: TabPlaceholderProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4">
      <h1 className="text-center text-2xl font-semibold text-white">
        {title}
      </h1>
    </div>
  )
}
