/** The KarachAir logo: green wind swirl, capital K, A and I in the same bright green, with "arach" and "r" in light mint. */
export function BrandLogo({ height = 28 }: { height?: number }) {
  return (
    <span className="brandlogo" style={{ ['--h' as string]: `${height}px` }} role="img" aria-label="KarachAir">
      <img src={`${import.meta.env.BASE_URL}karachair-wind.png`} alt="" height={Math.round(height * 0.9)} />
      <span className="brandlogo-word" aria-hidden="true"><b className="brandlogo-k">K</b>arach<b className="brandlogo-k">AI</b>r</span>
    </span>
  );
}
