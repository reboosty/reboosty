import { useEffect } from 'react';
import { useRouter } from 'next/router';

const DEFAULT_REPO = process.env.DEFAULT_REPO_URL || 'https://github.com/reboosty/reboosty';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the default repo URL
    router.replace(DEFAULT_REPO);
  }, [router]);

  return null;
}