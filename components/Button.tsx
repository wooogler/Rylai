import { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  children: ReactNode;
}

export default function Button({
  variant = "primary",
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = "font-medium rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed";

  const variantStyles = {
    primary: "px-6 py-2 bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-300",
    secondary: "px-6 py-3 bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-300",
    ghost: "flex items-center px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-transparent"
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}