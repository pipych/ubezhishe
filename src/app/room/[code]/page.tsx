const translateCatastrophe = (title: string) => {
  if (!title) return 'post-apocalyptic world catastrophe';
  const map: Record<string, string> = {
    'Падение астероида': 'Asteroid impact post apocalyptic frozen earth',
    'Ядерная война': 'Nuclear apocalypse ruined destruction city',
    'Зомби-апокалипсис': 'Zombie apocalypse ruined apocalyptic city',
    'Зомби-вирус': 'Lethal zombie virus pandemic apocalypse',
    'Глобальное потепление': 'Global warming climate desert disaster',
    'Всемирный потоп': 'World flood underwater sunken city apocalypse',
    'Эпидемия': 'Global lethal epidemic biohazard apocalypse',
    'Восстание ИИ': 'Cybernetic AI rebellion apocalypse robot war',
    'Вторжение пришельцев': 'Alien invasion destruction apocalypse',
    'Вулканическая зима': 'Volcanic winter ash dark sky apocalypse',
  };
  return map[title] || `${title} post apocalyptic catastrophe`;
};

const getCatastropheImageUrl = (catastropheTitle: string, roomSeed: string) => {
  if (!catastropheTitle) return null;
  const englishText = translateCatastrophe(catastropheTitle);
  const prompt = encodeURIComponent(
    `cinematic 16:9 aspect ratio, post-apocalyptic scene, ${englishText}, dark atmospheric background, highly detailed, photorealistic`
  );
  return `https://image.pollinations.ai/prompt/${prompt}?width=1280&height=720&nologo=true&seed=${roomSeed}`;
};

function CatastropheImage({ title, roomCode }: { title: string; roomCode: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imageUrl = getCatastropheImageUrl(title, roomCode);

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 flex items-center justify-center">
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950 text-xs sm:text-sm text-zinc-500 font-mono animate-pulse">
          Генерация изображения...
        </div>
      )}
      {error ? (
        <div className="text-xs text-zinc-600 font-mono p-4 text-center">
          Изображение недоступно
        </div>
      ) : (
        <img
          src={imageUrl || ''}
          alt={title}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={`w-full h-full object-cover transition-opacity duration-500 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
}
