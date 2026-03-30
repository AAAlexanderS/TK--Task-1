import imgHeart from "figma:asset/d5de1d32846d6f29445c0235bcbf49c931661671.png";

function Heart() {
  return (
    <div className="absolute contents inset-0" data-name="heart">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img alt="" className="absolute left-0 max-w-none size-full top-0" src={imgHeart} />
      </div>
    </div>
  );
}

function Page() {
  return (
    <div className="absolute contents inset-0" data-name="Page 1">
      <Heart />
    </div>
  );
}

export default function FaceSmilingFaceWithHeartEyes() {
  return (
    <div className="relative size-full" data-name="face / smiling-face-with-heart-eyes">
      <Page />
    </div>
  );
}
