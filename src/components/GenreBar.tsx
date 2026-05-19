import Link from 'next/link';

const CATEGORIES = [
  { label: 'Action',       href: '/search?genre=Action'        },
  { label: 'Romance',      href: '/search?genre=Romance'       },
  { label: 'Fantasy',      href: '/search?genre=Fantasy'       },
  { label: 'Comedy',       href: '/search?genre=Comedy'        },
  { label: 'Drama',        href: '/search?genre=Drama'         },
  { label: 'Horror',       href: '/search?genre=Horror'        },
  { label: 'Isekai',       href: '/search?genre=Isekai'        },
  { label: 'Slice of Life',href: '/search?genre=Slice+of+Life' },
  { label: 'Martial Arts', href: '/search?genre=Martial+Arts'  },
  { label: 'Mystery',      href: '/search?genre=Mystery'       },
  { label: 'Sci-Fi',       href: '/search?genre=Sci-Fi'        },
  { label: 'Sports',       href: '/search?genre=Sports'        },
  { label: 'Completed',    href: '/search?status=COMPLETED'    },
];

export function GenreBar() {
  // Duplicate for seamless loop
  const doubled = [...CATEGORIES, ...CATEGORIES];

  return (
    <div className="relative overflow-hidden py-0.5 group">
      {/* Left fade */}
      <div
        className="pointer-events-none absolute left-0 top-0 bottom-0 w-10 z-10"
        style={{ background: 'linear-gradient(to right, var(--bg-primary), transparent)' }}
      />
      {/* Right fade */}
      <div
        className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 z-10"
        style={{ background: 'linear-gradient(to left, var(--bg-primary), transparent)' }}
      />

      {/* Marquee track */}
      <div
        className="flex gap-2 w-max"
        style={{ animation: 'marquee-scroll 35s linear infinite' }}
      >
        {doubled.map((item, i) => (
          <Link
            key={i}
            href={item.href}
            className="shrink-0 rounded-full px-5 py-2 text-sm font-semibold whitespace-nowrap transition-all hover:scale-105 active:scale-95"
            style={{
              background: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-light)',
            }}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

