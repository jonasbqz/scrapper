import sys
import json
import argparse
import re
from scrapling.fetchers import StealthySession

def get_element_text(element):
    if element is None:
        return ""
    if hasattr(element, "get_all_text") and callable(element.get_all_text):
        try:
            return element.get_all_text().strip()
        except:
            pass
    if hasattr(element, "text"):
        try:
            val = element.text
            if isinstance(val, str):
                return val.strip()
            if callable(val):
                return val().strip()
            return str(val).strip()
        except:
            pass
    try:
        return element.text().strip()
    except:
        pass
    return ""


def main():
    parser = argparse.ArgumentParser(description="Scrape manga information or images from leercapitulo.co using Scrapling")
    parser.add_argument("url", help="URL of the manga or chapter to scrape")
    args = parser.parse_args()

    url = args.url
    if not url.startswith("http"):
        print(json.dumps({"error": "Invalid URL"}), file=sys.stdout)
        sys.exit(1)

    try:
        # Fetch the page with Cloudflare solving enabled using StealthySession context manager
        print(f"Fetching: {url}", file=sys.stderr)
        with StealthySession(solve_cloudflare=True, headless=True) as session:
            response = session.fetch(url)
            
            if response.status != 200:
                print(json.dumps({"error": f"Failed to load page. Status: {response.status}"}), file=sys.stdout)
                sys.exit(1)

            url_lower = url.lower().rstrip('/')
            is_home = url_lower in (
                "https://www.leercapitulo.co",
                "http://www.leercapitulo.co",
                "https://leercapitulo.co",
                "http://leercapitulo.co",
            )

            # If not a search query or the home feed, verify we weren't redirected to the home page.
            is_search = "/search-autocomplete" in url.lower() or "term=" in url.lower()
            if not is_search and not is_home:
                final_url = response.url.lower().rstrip('/')
                if final_url == "https://www.leercapitulo.co" or (not ("/manga/" in final_url or "/leer/" in final_url)):
                    print(json.dumps({"success": False, "error": f"Manga or chapter not found (redirected to: {response.url})"}), file=sys.stdout)
                    sys.exit(1)

            # Detect if it is a search autocomplete query, a manga info page, or a chapter reading page
            is_manga_page = not is_search and not is_home and ("/manga/" in url.lower() or not ("/leer/" in url.lower() or "capitulo-" in url.lower()))

            if is_search:
                try:
                    raw_body = response.html_content.strip()
                    if raw_body.startswith('<') and '[' in raw_body:
                        match = re.search(r'\[.*\]', raw_body, re.DOTALL)
                        if match:
                            raw_body = match.group(0)
                    
                    results_data = json.loads(raw_body)
                    results = []
                    for item in results_data:
                        title = item.get("label", item.get("value", ""))
                        link = item.get("link", "")
                        cover = item.get("thumbnail", "")
                        
                        if cover:
                            if cover.startswith('//'):
                                cover = 'https:' + cover
                            elif cover.startswith('/'):
                                cover = 'https://www.leercapitulo.co' + cover
                            elif not cover.startswith('http'):
                                cover = 'https://www.leercapitulo.co/' + cover
                                
                        if link:
                            if link.startswith('//'):
                                manga_url = 'https:' + link
                            elif link.startswith('/'):
                                manga_url = 'https://www.leercapitulo.co' + link
                            elif not link.startswith('http'):
                                manga_url = 'https://www.leercapitulo.co/' + link
                            else:
                                manga_url = link
                        else:
                            manga_url = ""
                            
                        slug = ""
                        if link:
                            parts = [p for p in link.strip('/').split('/') if p]
                            if len(parts) >= 2 and parts[-2] == 'manga':
                                slug = parts[-1]
                            elif len(parts) >= 3 and parts[-3] == 'manga':
                                slug = f"{parts[-2]}-{parts[-1]}"
                            else:
                                slug = parts[-1] if parts else ""
                        
                        results.append({
                            "title": title,
                            "slug": slug,
                            "url": manga_url,
                            "cover": cover,
                            "status": "Desconocido"
                        })
                    
                    output = {
                        "success": True,
                        "type": "search",
                        "query": url.split('term=')[-1] if 'term=' in url else "",
                        "total_results": len(results),
                        "results": results
                    }
                except Exception as e:
                    output = {
                        "success": False,
                        "error": f"Failed to parse search results: {str(e)}"
                    }
            elif is_home:
                try:
                    tendencias = []
                    for el in response.css('.hot-manga'):
                        title_el = el.css('.manga-title')
                        title = get_element_text(title_el[0]) if title_el else ""

                        link_el = el.css('a[href*="/manga/"]')
                        link = link_el[0].attrib.get('href', '') if link_el else ""

                        img_el = el.css('img')
                        cover = ""
                        if img_el:
                            img = img_el[0]
                            cover = img.attrib.get('data-src') or img.attrib.get('src') or ""

                        ch_el = el.css('a[href*="/leer/"]')
                        latest_ch = {}
                        if ch_el:
                            ch_link = ch_el[0].attrib.get('href', '')
                            ch_text = get_element_text(ch_el[0])
                            num = ch_link.rstrip('/').split('/')[-1] if ch_link else ""
                            latest_ch = {
                                "number": num,
                                "title": ch_text,
                                "url": ch_link
                            }

                        slug = link.rstrip('/').split('/')[-1] if link else ""

                        if link and not link.startswith('http'):
                            link = 'https://www.leercapitulo.co' + link
                        if cover and not cover.startswith('http'):
                            if cover.startswith('//'):
                                cover = 'https:' + cover
                            else:
                                cover = 'https://www.leercapitulo.co' + cover
                        if latest_ch.get("url") and not latest_ch["url"].startswith('http'):
                            latest_ch["url"] = 'https://www.leercapitulo.co' + latest_ch["url"]

                        tendencias.append({
                            "title": title,
                            "slug": slug,
                            "url": link,
                            "cover": cover,
                            "latest_chapter": latest_ch
                        })

                    recientes = []
                    for el in response.css('.mainpage-manga'):
                        title_el = el.css('.manga-newest')
                        title = get_element_text(title_el[0]) if title_el else ""

                        link_el = el.css('a[href*="/manga/"]')
                        link = link_el[0].attrib.get('href', '') if link_el else ""

                        img_el = el.css('img')
                        cover = ""
                        if img_el:
                            img = img_el[0]
                            cover = img.attrib.get('data-src') or img.attrib.get('src') or ""

                        slug = link.rstrip('/').split('/')[-1] if link else ""

                        chapters = []
                        ch_spans = el.css('.hotup-list span')
                        time_tags = el.css('.hotup-list i')

                        for idx, span in enumerate(ch_spans):
                            ch_a = span.css('a')
                            if ch_a:
                                ch_link = ch_a[0].attrib.get('href', '')
                                ch_text = get_element_text(ch_a[0])
                                num = ch_link.rstrip('/').split('/')[-1] if ch_link else ""

                                time_text = ""
                                if idx < len(time_tags):
                                    time_text = get_element_text(time_tags[idx])

                                if ch_link and not ch_link.startswith('http'):
                                    ch_link = 'https://www.leercapitulo.co' + ch_link

                                chapters.append({
                                    "number": num,
                                    "title": ch_text,
                                    "url": ch_link,
                                    "time": time_text
                                })

                        if link and not link.startswith('http'):
                            link = 'https://www.leercapitulo.co' + link
                        if cover and not cover.startswith('http'):
                            if cover.startswith('//'):
                                cover = 'https:' + cover
                            else:
                                cover = 'https://www.leercapitulo.co' + cover

                        recientes.append({
                            "title": title,
                            "slug": slug,
                            "url": link,
                            "cover": cover,
                            "chapters": chapters
                        })

                    output = {
                        "success": True,
                        "type": "home",
                        "tendencias": tendencias,
                        "recientes": recientes
                    }
                except Exception as e:
                    output = {
                        "success": False,
                        "error": f"Failed to parse home: {str(e)}"
                    }
            elif is_manga_page:
                # 1. Title
                title = ""
                title_selectors = [
                    'h1.title-manga',
                    'h1.title', 
                    '.manga-info h1', 
                    'h1', 
                    '.manga-title', 
                    '.entry-title', 
                    '.post-title'
                ]
                for selector in title_selectors:
                    els = response.css(selector)
                    if els:
                        title = get_element_text(els[0])
                        if title:
                            break

                # 2. Synopsis
                synopsis = ""
                synopsis_selectors = [
                    '.manga-collapse',
                    '.sinopsis', 
                    '.manga-description', 
                    '.description-content', 
                    '.manga-desc', 
                    '.summary-content', 
                    '.post-content_item .summary-content', 
                    '#description'
                ]
                for selector in synopsis_selectors:
                    els = response.css(selector)
                    if els:
                        synopsis = get_element_text(els[0])
                        if synopsis:
                            break

                # 3. Author
                author = ""
                author_els = response.css('a[href*="/autor/"]') or response.css('a[href*="/author/"]')
                if author_els:
                    author = get_element_text(author_els[0])
                
                if not author:
                    author_selectors = ['.author-content a', '.author a', '.manga-author']
                    for selector in author_selectors:
                        els = response.css(selector)
                        if els:
                            author = get_element_text(els[0])
                            if author:
                                break
                if not author:
                    author = "Autor desconocido"

                # 4. Cover Image
                cover_image = ""
                cover_selectors = [
                    '.cover-detail img',
                    '.manga-cover img', 
                    '.cover-manga img', 
                    '.manga-image img', 
                    '.manga-detail img', 
                    '.summary_image img',
                    '.thumb img'
                ]
                for selector in cover_selectors:
                    els = response.css(selector)
                    if els:
                        el = els[0]
                        for attr in ['data-src', 'src', 'lazy-src', 'data-lazy-src']:
                            src = el.attrib.get(attr, '').strip()
                            if src:
                                if src.startswith('//'):
                                    cover_image = 'https:' + src
                                elif src.startswith('/'):
                                    cover_image = 'https://www.leercapitulo.co' + src
                                elif src.startswith('http'):
                                    cover_image = src
                                else:
                                    cover_image = 'https://www.leercapitulo.co/' + src
                                break
                    if cover_image:
                        break

                # 5. Genres, Status, Alt Titles
                genres = []
                status = "Desconocido"
                alt_titles = []
                
                # Extract genres
                genre_els = response.css('.manga-detail a[href*="/genre/"], .manga-info a[href*="/genre/"]')
                for el in genre_els:
                    g_text = get_element_text(el)
                    if g_text and g_text not in genres:
                        genres.append(g_text)
                
                # Extract status & alt titles from p.description-update
                desc_els = response.css('p.description-update')
                if desc_els:
                    desc_text = get_element_text(desc_els[0])
                    clean_desc = re.sub(r'\s+', ' ', desc_text).strip()
                    status_match = re.search(r'Estado:\s*(\w+)', clean_desc, re.IGNORECASE)
                    if status_match:
                        status = status_match.group(1).strip()
                    alt_match = re.search(r'Alternativos:\s*(.*?)\s*(?:G.neros:|Escribe:)', clean_desc, re.IGNORECASE)
                    if alt_match:
                        alt_titles = [t.strip() for t in alt_match.group(1).split(',') if t.strip()]

                # 6. Chapters list
                chapters = []
                links = response.css('.chapter-list a') or response.css('a')
                seen_urls = set()
                for link in links:
                    href = link.attrib.get('href', '').strip()
                    if href and not href.startswith('http'):
                        if href.startswith('/'):
                            href = "/".join(url.split("/")[:3]) + href
                        else:
                            href = url.rstrip('/') + '/' + href

                    if href and ('/leer/' in href.lower() or 'capitulo-' in href.lower()):
                        if href not in seen_urls:
                            seen_urls.add(href)
                            chapter_title = get_element_text(link)
                            if not chapter_title:
                                chapter_title = href.split('/')[-1] or href.split('/')[-2]
                            
                            # Extract chapter number
                            parts = href.rstrip('/').split('/')
                            chapter_number = parts[-1] if parts else ""
                            
                            chapters.append({
                                "number": chapter_number,
                                "title": chapter_title,
                                "url": href
                            })

                # Sort chapters descending by chapter number
                def chapter_sort_key(ch):
                    num_str = ch.get("number", "0").replace(",", ".")
                    try:
                        return (0, -float(num_str))
                    except ValueError:
                        return (1, ch.get("number", ""))
                
                chapters.sort(key=chapter_sort_key)

                # Return structural details
                output = {
                    "success": True,
                    "type": "manga",
                    "url": url,
                    "title": title,
                    "manga_title": title,
                    "synopsis": synopsis,
                    "description": synopsis,
                    "author": author,
                    "cover": cover_image,
                    "coverImage": cover_image,
                    "genres": genres,
                    "status": status,
                    "altTitles": alt_titles,
                    "chapters": chapters,
                    "chapters_count": len(chapters)
                }

            else:
                # Chapter page extraction (original behavior)
                # Get image URLs from the #page_select option values
                options = response.css('#page_select option')
                image_urls = []
                for opt in options:
                    val = opt.attrib.get('value', '').strip()
                    if val and val.startswith('http'):
                        image_urls.append(val)
                        
                # If no option values are found, fall back to other potential selects or img tag inside reader
                if not image_urls:
                    options_top = response.css('#page_select_top option')
                    for opt in options_top:
                        val = opt.attrib.get('value', '').strip()
                        if val and val.startswith('http') and val not in image_urls:
                            image_urls.append(val)
                            
                # If still no image URLs, try extracting from typical image wrappers
                if not image_urls:
                    # Check for img inside comic_wraCon or reading-content
                    imgs = response.css('.comic_wraCon img, .reading-content img, .chapter-images img')
                    for img in imgs:
                        src = img.attrib.get('data-src') or img.attrib.get('src')
                        if src and src.startswith('http') and src not in image_urls:
                            image_urls.append(src)

                manga_name = ""
                chapter_number = ""
                parts = [p for p in url.strip('/').split('/') if p]
                if len(parts) >= 2:
                    chapter_number = parts[-1]
                    manga_name = parts[-2]
                
                output = {
                    "success": True,
                    "type": "chapter",
                    "url": url,
                    "manga": manga_name,
                    "chapter": chapter_number,
                    "pages": image_urls,
                    "images": image_urls,
                    "total_pages": len(image_urls),
                    "count": len(image_urls)
                }

            print(json.dumps(output, indent=2, ensure_ascii=True), file=sys.stdout)
        
    except Exception as e:
        error_output = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(error_output, ensure_ascii=True), file=sys.stdout)
        sys.exit(1)

if __name__ == "__main__":
    main()
