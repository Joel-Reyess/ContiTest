
import ContinentalLogo from "@/assets/Logo.webp"
import { NavbarUser } from "@/components/ui/navbar-user";

export const Navbar = ({children}: {children: React.ReactNode}) => {

  return (
    <header className="sticky top-0 z-30 w-full bg-white/95 backdrop-blur border-b border-continental-gray-3 shadow-industrial-xs">
      <div className="flex justify-between w-full items-center gap-4 px-5 h-16">
        <div className="flex items-center gap-4 shrink-0">
          <img src={ContinentalLogo} alt="Continental" className="h-8 w-auto" />
          <span aria-hidden="true" className="h-8 w-px bg-continental-gray-3" />
          <span className="hidden md:inline text-xs font-semibold uppercase tracking-[0.18em] text-continental-gray-1">
            Vacaciones
          </span>
        </div>
        <div className="flex-1 flex justify-center overflow-x-auto">
          {children}
        </div>
        <div className="shrink-0">
          <NavbarUser />
        </div>
      </div>
    </header>
  )
}
