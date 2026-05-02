import Image from 'next/image';

type GleipnirLogoProps = {
  size?: 'hero' | 'nav';
};

const sizeClasses = {
  hero: 'h-36 w-36 md:h-44 md:w-44',
  nav: 'h-8 w-8',
};

const imageSizes = {
  hero: 176,
  nav: 32,
};

export default function GleipnirLogo({ size = 'nav' }: GleipnirLogoProps) {
  return (
    <Image
      src="/gleipnir-logo.jpg"
      alt="Gleipnir logo"
      width={imageSizes[size]}
      height={imageSizes[size]}
      className={`${sizeClasses[size]} object-contain`}
      priority={size === 'hero'}
    />
  );
}
