import imgEmoji20 from "figma:asset/aad5b759145e9cd45b94a77fc95b01643b78b1ff.png";

function Emoji() {
  return (
    <div className="absolute contents inset-0" data-name="emoji 20">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img alt="" className="absolute left-0 max-w-none size-full top-0" src={imgEmoji20} />
      </div>
    </div>
  );
}

function Page() {
  return (
    <div className="absolute contents inset-0" data-name="Page 1">
      <Emoji />
    </div>
  );
}

export default function FaceFearfulFace() {
  return (
    <div className="relative size-full" data-name="face / fearful-face">
      <Page />
    </div>
  );
}
