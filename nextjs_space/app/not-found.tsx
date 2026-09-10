import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">404</p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The page you are looking for does not exist or may have moved.
      </p>
      <div className="mt-6 flex gap-2">
        <Link href="/"><Button>Go home</Button></Link>
        <Link href="/dashboard"><Button variant="outline">My events</Button></Link>
      </div>
    </div>
  );
}