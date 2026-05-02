import Image from 'next/image';

type GleipnirLogoProps = {
  size?: 'hero' | 'nav';
};

const sizeClasses = {
  hero: 'h-44 w-44 md:h-56 md:w-56',
  nav: 'h-8 w-8',
};

const imageSizes = {
  hero: { width: 224, height: 224 },
  nav: { width: 32, height: 32 },
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
