interface FullScreenLoadingProps {
  message?: string;
}

const FullScreenLoading = ({ message = 'Loading dashboard...' }: FullScreenLoadingProps) => (
  <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
    <div className="flex flex-col items-center gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-border border-t-primary"></div>
      <p className="text-muted-foreground font-medium">{message}</p>
    </div>
  </div>
);

export default FullScreenLoading;
