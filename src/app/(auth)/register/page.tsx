import type { Metadata } from 'next';
import { RegisterForm } from '@/components/auth/RegisterForm';

export const metadata: Metadata = { title: 'Daftar' };

export default function RegisterPage() {
  return <RegisterForm />;
}
