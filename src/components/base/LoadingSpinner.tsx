
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'red' | 'blue' | 'green' | 'orange';
  text?: string;
}

export default function LoadingSpinner({ 
  size = 'md', 
  color = 'red', 
  text = 'Cargando...' 
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-12 w-12',
    lg: 'h-16 w-16'
  };

  const colorClasses = {
    red: 'border-red-500',
    blue: 'border-blue-500',
    green: 'border-green-500',
    orange: 'border-orange-500'
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <div 
        className={`animate-spin rounded-full border-b-2 ${sizeClasses[size]} ${colorClasses[color]} mb-4`}
      ></div>
      {text && <p className="text-gray-600 text-sm">{text}</p>}
    </div>
  );
}
