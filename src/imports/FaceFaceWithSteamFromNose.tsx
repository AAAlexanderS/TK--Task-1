import imgEmoji17 from "figma:asset/3eca0e8953566a066fa657a04f14050255bbb3c0.png";

function Emoji() {
  return (
    <div className="absolute contents inset-0" data-name="emoji 17">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img alt="" className="absolute left-0 max-w-none size-full top-0" src={imgEmoji17} />
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

export default function FaceFaceWithSteamFromNose() {
  return (
    <div className="relative size-full" data-name="face / face-with-steam-from-nose">
      <Page />
    </div>
  );
}
