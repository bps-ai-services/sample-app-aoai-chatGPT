import React, { useEffect } from 'react';

const MSClarityScript: React.FC = () => {
    useEffect(() => {
        const clarityScript = document.createElement('script');
        clarityScript.async = true;
        clarityScript.type = 'text/javascript';
        clarityScript.text = `
            (function(c,l,a,r,i,t,y){
                c[a] = c[a] || function() { (c[a].q = c[a].q || []).push(arguments) };
                t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
                y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
            })(window, document, "clarity", "script", "n61ut6mhm9");
        `;
        document.head.appendChild(clarityScript);

        return () => {
            document.head.removeChild(clarityScript);
        };
    }, []);

    return null;
};

export default MSClarityScript;
