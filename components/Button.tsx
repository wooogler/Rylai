import { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "default" | "small";
  children: ReactNode;
}

export default function Button({
  variant = "primary",
  size = "default",
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = "font-medium rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed";

  const variantStyles = {
    primary: "bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-300",
    secondary: "bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-300",
    ghost: "flex items-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-transparent"
  };

  const sizeStyles = {
    default: variant === "secondary" ? "px-6 py-3" : "px-6 py-2",
    small: "px-3 py-1.5 text-sm"
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}