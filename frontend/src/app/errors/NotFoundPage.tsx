import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 text-center">
      <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
      <p className="text-xl text-foreground">Page not found</p>
      <Button asChild variant="outline">
        <Link to="/">Go home</Link>
      </Button>
    </div>
  );
}
