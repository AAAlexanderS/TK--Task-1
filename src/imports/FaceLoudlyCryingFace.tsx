import imgEmojisM from "figma:asset/9320919a25c334db7b563284933ffa263aba8121.png";

function EmojisM() {
  return (
    <div className="absolute contents inset-0" data-name="emojis M">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img alt="" className="absolute left-0 max-w-none size-full top-0" src={imgEmojisM} />
      </div>
    </div>
  );
}

function Page() {
  return (
    <div className="absolute contents inset-0" data-name="Page 1">
      <EmojisM />
    </div>
  );
}

export default function FaceLoudlyCryingFace() {
  return (
    <div className="relative size-full" data-name="face / loudly-crying-face">
      <Page />
    </div>
  );
}
