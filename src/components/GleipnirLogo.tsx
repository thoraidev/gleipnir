import Image from 'next/image';

type GleipnirLogoProps = {
  size?: 'hero' | 'nav';
};

const sizeClasses = {
  hero: 'h-28 w-72 md:h-32 md:w-80',
  nav: 'h-6 w-16',
};

const imageSizes = {
  hero: { width: 320, height: 128 },
  nav: { width: 64, height: 24 },
};

export default function GleipnirLogo({ size = 'nav' }: GleipnirLogoProps) {
  return (
    <Image
      src="/gleipnir-logo.png"
      alt="Gleipnir logo"
      width={imageSizes[size].width}
      height={imageSizes[size].height}
      className={`${sizeClasses[size]} object-contain`}
      priority={size === 'hero'}
    />
  );
}
